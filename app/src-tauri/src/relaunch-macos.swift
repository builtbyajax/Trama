import AppKit
import Darwin
import Foundation

enum RelaunchError: Error {
    case invalidArguments, previousAppStillRunning, launchTimedOut, missingApplication
    case previousRegistrationStillPresent, anotherInstanceRunning
}

func relaunch() throws {
    defer { try? FileManager.default.removeItem(atPath: CommandLine.arguments[0]) }
    guard CommandLine.arguments.count >= 3,
          let previousPid = Int32(CommandLine.arguments[2]), previousPid > 0 else {
        throw RelaunchError.invalidArguments
    }
    let bundleURL = URL(fileURLWithPath: CommandLine.arguments[1])
    guard let bundle = Bundle(url: bundleURL), bundle.executableURL != nil,
          let bundleIdentifier = bundle.bundleIdentifier else {
        throw RelaunchError.missingApplication
    }
    let queue = kqueue()
    guard queue >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
    defer { close(queue) }
    var change = kevent64_s()
    change.ident = UInt64(previousPid)
    change.filter = Int16(EVFILT_PROC)
    change.flags = UInt16(EV_ADD | EV_ONESHOT)
    change.fflags = UInt32(NOTE_EXIT)
    let registered = kevent64(queue, &change, 1, nil, 0, 0, nil) == 0
    if !registered && errno != ESRCH {
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }
    let config = NSWorkspace.OpenConfiguration()
    config.createsNewApplicationInstance = false
    config.allowsRunningApplicationSubstitution = false
    config.addsToRecentItems = true
    config.arguments = Array(CommandLine.arguments.dropFirst(3))
    config.environment = ProcessInfo.processInfo.environment.filter {
        $0.key == "TRAMA_HOME" || $0.key == "TRAMA_DB"
    }
    FileHandle.standardOutput.write(Data("READY\n".utf8))

    if registered {
        var event = kevent64_s()
        var timeout = timespec(tv_sec: 30, tv_nsec: 0)
        var result: Int32
        repeat {
            result = kevent64(queue, nil, 0, &event, 1, 0, &timeout)
        } while result < 0 && errno == EINTR
        guard result > 0 else { throw RelaunchError.previousAppStillRunning }
        if event.flags & UInt16(EV_ERROR) != 0 {
            throw POSIXError(POSIXErrorCode(rawValue: Int32(event.data)) ?? .EIO)
        }
    }

    // The Dock follows LaunchServices, whose registration can outlive the process.
    // Re-query inside a fresh autorelease pool instead of retaining an old app object.
    let registrationWaitStarted = Date()
    let registrationDeadline = registrationWaitStarted.addingTimeInterval(30)
    var remainingPids: [pid_t] = []
    while true {
        let previousRegistered = autoreleasepool {
            guard let previous = NSRunningApplication(processIdentifier: previousPid) else {
                return false
            }
            return !previous.isTerminated
        }
        remainingPids = autoreleasepool {
            NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
                .filter { !$0.isTerminated }.map { $0.processIdentifier }
        }
        if !previousRegistered && !remainingPids.contains(previousPid) { break }
        guard Date() < registrationDeadline else {
            throw RelaunchError.previousRegistrationStillPresent
        }
        Thread.sleep(forTimeInterval: 0.05)
    }
    guard remainingPids.isEmpty else { throw RelaunchError.anotherInstanceRunning }
    let registrationWaitMilliseconds = Int(Date().timeIntervalSince(registrationWaitStarted) * 1000)

    var finished = false
    var launchError: Error?
    NSWorkspace.shared.openApplication(at: bundleURL, configuration: config) { app, error in
        DispatchQueue.main.async {
            launchError = error
            if error == nil && app == nil { launchError = RelaunchError.missingApplication }
            if let app {
                let result: [String: Any] = ["previousPid": previousPid,
                                            "pid": app.processIdentifier,
                                            "path": bundleURL.path,
                                            "registeredPidsBeforeLaunch": remainingPids,
                                            "registrationWaitMilliseconds": registrationWaitMilliseconds,
                                            "createsNewApplicationInstance": false]
                if let data = try? JSONSerialization.data(withJSONObject: result) {
                    FileHandle.standardError.write(data + Data("\n".utf8))
                }
            }
            finished = true
        }
    }
    let launchDeadline = Date().addingTimeInterval(30)
    while !finished && Date() < launchDeadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
    guard finished else { throw RelaunchError.launchTimedOut }
    if let launchError { throw launchError }
}

do {
    try relaunch()
} catch {
    FileHandle.standardError.write(Data("Relaunch failed: \(error)\n".utf8))
    exit(1)
}
