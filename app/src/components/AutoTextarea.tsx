import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Textarea that grows with its content between `minRows` and `maxRows`, then scrolls. With `submitOnEnter`,
 * Enter submits the surrounding form (Shift+Enter keeps a line break); otherwise
 * Cmd/Ctrl+Enter submits.
 */
export function AutoTextarea({
  minRows = 1,
  maxRows = 12,
  submitOnEnter = false,
  onKeyDown,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  minRows?: number;
  maxRows?: number;
  submitOnEnter?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const line = parseFloat(style.lineHeight) || 19;
      const padding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const border =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      element.style.height = "auto";
      const content = Math.max(
        line * minRows + padding,
        Math.min(element.scrollHeight, line * maxRows + padding),
      );
      element.style.height = `${Math.ceil(content + border)}px`;
    };
    fit();
    // Wrapping changes when the inspector or window is resized.
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.value, minRows, maxRows]);
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter") return;
    if (event.nativeEvent.isComposing) return;
    const modifier = event.metaKey || event.ctrlKey;
    if ((submitOnEnter && !event.shiftKey) || (!submitOnEnter && modifier)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      {...props}
      onKeyDown={keyDown}
      className={`auto-textarea ${props.className ?? ""}`}
    />
  );
}
