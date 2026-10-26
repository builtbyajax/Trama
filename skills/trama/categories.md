# Choosing a category

New projects start with these categories. The list is saved per project, and projects created before the defaults were in English have them in Portuguese, so check `get_context` and use exactly one of the categories available in that project. Choose by the task's main deliverable, not by an intermediate step.

| Category | Use when the main deliverable is... |
|---|---|
| **Feature** | Adding a new capability or behavior to the product. |
| **Fix** | Repairing existing behavior that is wrong, broken or regressed. |
| **Tests** | Creating or changing tests, test cases or the test setup. |
| **Validation** | Checking a finished change through QA, acceptance criteria or manual checks, and recording the result. |
| **Investigation** | Understanding a cause, assessing feasibility or comparing options, delivering conclusions or a recommendation. |
| **Documentation** | Creating or updating documentation for users or for development. |
| **Infrastructure** | Changing the build, releases, CI, dependencies, repository settings, development environment or operations. |
| **Migration** | Porting something existing to another technology, framework, version or structure, keeping the behavior it already has. |
| **Refactoring** | Reorganizing or simplifying code without changing behavior, such as splitting files, renaming or removing duplication. |
| **Interface** | Improving the look or usability of something that already works: layout, spacing, colors, on-screen text, focus and accessibility. |
| **Security** | Protecting against unauthorized access or leaks: authentication, permissions, input validation, secrets and vulnerabilities. |
| **Performance** | Making something faster or lighter, such as load time, queries, memory or build size. |

Rules of thumb:

- Classify by the expected outcome: investigating before fixing is still **Fix** if the deliverable is resolving the defect; investigating to find the cause and recommend a path is **Investigation**.
- **Tests** is for creating or maintaining tests. Running them to check a feature or fix is part of that task; it doesn't change its category.
- **Validation** is for QA or acceptance of a finished implementation. If the task is writing the tests that will do that check, use **Tests**.
- **Migration** is for moving what exists to another base without changing what it does, such as switching frameworks or a library's major version. New behavior requested during the migration is **Feature**; a defect found in it is **Fix**. Only adjusting the build setup or updating a dependency without porting code is **Infrastructure**.
- **Refactoring** changes the shape of the code, not what it does; if behavior changes, the category is that of the change. Switching frameworks or versions is **Migration**.
- **Interface** is for something that already works and needs to be easier to see or use. A screen that shows the wrong data or breaks is **Fix**; a new screen is **Feature**.
- **Security** and **Performance** apply when protecting or speeding up is the main deliverable, even if the problem showed up as a defect. Measuring to find where the slowness or risk is, without fixing it, is **Investigation**.
- If the person names a category, follow it. If no available category fits, don't invent one: pick the closest when it's clear; otherwise ask before creating the task.
