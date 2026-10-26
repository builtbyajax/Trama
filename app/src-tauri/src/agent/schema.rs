//! Single source of truth for discoverable tool arguments and runtime validation.
use crate::store::{Result, STATUSES};
use serde_json::{json, Value};
pub fn tools(workspace: bool) -> Vec<Value> {
    let text = json!({"type":"string"});
    let nullable = json!({"type":["string","null"]});
    let uuid = json!({"type":"string","format":"uuid"});
    let status = json!({"type":"string","enum":STATUSES});
    let assignee = json!({"type":"string","enum":["user","agent"]});
    let limit = json!({"type":"integer","minimum":1,"maximum":200});
    let offset = json!({"type":"integer","minimum":0});
    let mut all = vec![];
    let mut add = |name: &str,
                   description: &str,
                   mut properties: Value,
                   mut required: Vec<&str>,
                   scoped: bool,
                   readonly: bool,
                   destructive: bool| {
        if workspace && scoped {
            properties["project_id"] = uuid.clone();
            required.push("project_id");
        }
        all.push(json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false},"annotations":{"readOnlyHint":readonly,"destructiveHint":destructive,"openWorldHint":name=="list_pull_requests"}}));
    };
    add(
        "list_projects",
        "Lists the projects available on this connection. Project mode returns only its project.",
        json!({}),
        vec![],
        false,
        true,
        false,
    );
    if workspace {
        add(
            "create_project",
            "Creates a local project; the optional repository_path connects an existing Git repository.",
            json!({"name":text,"repository_path":nullable}),
            vec!["name"],
            false,
            false,
            false,
        );
        add("delete_project","Deletes the project with all its tasks, messages, checks and annotations. Use only when asked.",json!({"project_id":uuid}),vec!["project_id"],false,false,true);
    }
    add("get_context","Reads the project, connected repository, categories with counts, valid statuses and access rules. Annotations are private.",json!({}),vec![],true,true,false);
    add(
        "update_project",
        "Edits the project's name and Git connection. null disconnects the repository.",
        json!({"name":text,"repository_path":nullable}),
        vec![],
        true,
        false,
        false,
    );
    add(
        "list_categories",
        "Lists the project's categories, empty ones included, with task counts.",
        json!({}),
        vec![],
        true,
        true,
        false,
    );
    add(
        "create_category",
        "Creates a category in the project, with a name of up to 80 characters.",
        json!({"name":text}),
        vec!["name"],
        true,
        false,
        false,
    );
    add(
        "rename_category",
        "Renames a category and updates its tasks atomically.",
        json!({"name":text,"new_name":text}),
        vec!["name", "new_name"],
        true,
        false,
        false,
    );
    add("delete_category","Deletes a category; replacement is required when it has tasks. Logs the change in the activity.",json!({"name":text,"replacement":nullable}),vec!["name"],true,false,true);
    add("list_tasks","Lists the project's tasks and drafts in board order: by column, top to bottom. Optional filters; paginated with limit/offset (at most 200).",json!({"status":status,"category":text,"assignee":assignee,"goal_id":{"type":"string","format":"uuid"},"limit":limit,"offset":offset}),vec![],true,true,false);
    add("list_goals","Lists the project's goals with their progress (done tasks over tasks on the board, drafts left out). Concluded goals have completed_at.",json!({}),vec![],true,true,false);
    let date =
        json!({"type":["string","null"],"description":"A day, YYYY-MM-DD; null removes it."});
    add(
        "create_goal",
        "Creates a goal in the project: what a group of its tasks is for.",
        json!({"name":text,"description":text,"target_date":date}),
        vec!["name"],
        true,
        false,
        false,
    );
    add(
        "update_goal",
        "Edits only the goal fields sent. Concluding a goal is left to the person.",
        json!({"goal_id":uuid,"name":text,"description":text,"target_date":date}),
        vec!["goal_id"],
        true,
        false,
        false,
    );
    add("search_tasks","Searches public context and messages, ignoring accents. Never searches private annotations.",json!({"query":text,"limit":limit,"offset":offset}),vec!["query"],true,true,false);
    add("get_task","Reads a task: Markdown context, category, assignee, position, counts and delivery metadata.",json!({"task_id":uuid}),vec!["task_id"],true,true,false);
    add("get_task_details","Reads the full task, public messages, checklist and event history. Leaves out private annotations.",json!({"task_id":uuid}),vec!["task_id"],true,true,false);
    let goal_ref = json!({"type":["string","null"],"format":"uuid","description":"A goal of the same project (list_goals); null takes the task out of its goal."});
    let task_fields = json!({"goal_id":goal_ref,"title":text,"details":text,"category":text,"assignee":assignee,"status":status,"agent_summary":nullable,"repository_branch":{"type":["string","null"],"description":"Existing local branch in the project's repository where the task is worked on. Trama doesn't create branches; null removes it."},"commit_hash":nullable,"pull_request_url":nullable,"pull_request_number":{"type":["integer","null"],"minimum":1}});
    add("create_task","Creates a task or draft with optional context and delivery; by default assignee agent, status todo, category Feature.",task_fields.clone(),vec!["title"],true,false,false);
    let mut patch = task_fields;
    patch["task_id"] = uuid.clone();
    add("update_task","Edits only the fields sent, without overwriting concurrent edits to other fields. null clears optional metadata. Deliveries are references; they don't run Git.",patch,vec!["task_id"],true,false,false);
    add("move_task","Moves a task or draft to a status and position; after_id is the card before it, null puts it at the top.",json!({"task_id":uuid,"status":status,"after_id":{"type":["string","null"],"format":"uuid"}}),vec!["task_id","status"],true,false,false);
    add(
        "promote_draft",
        "Promotes a Preparing/Reserved draft to To do.",
        json!({"task_id":uuid}),
        vec!["task_id"],
        true,
        false,
        false,
    );
    add(
        "delete_task",
        "Deletes a task and its data. Use only when asked.",
        json!({"task_id":uuid}),
        vec!["task_id"],
        true,
        false,
        true,
    );
    add(
        "read_task_messages",
        "Reads the task's public messages, paginated with limit/offset.",
        json!({"task_id":uuid,"limit":limit,"offset":offset}),
        vec!["task_id"],
        true,
        true,
        false,
    );
    add(
        "add_task_message",
        "Adds an agent comment to the task's activity.",
        json!({"task_id":uuid,"body":text}),
        vec!["task_id", "body"],
        true,
        false,
        false,
    );
    add(
        "update_task_message",
        "Edits a public message's body, keeping its original author and date.",
        json!({"task_id":uuid,"message_id":uuid,"body":text}),
        vec!["task_id", "message_id", "body"],
        true,
        false,
        false,
    );
    add(
        "delete_task_message",
        "Deletes a public message from the task.",
        json!({"task_id":uuid,"message_id":uuid}),
        vec!["task_id", "message_id"],
        true,
        false,
        true,
    );
    add(
        "list_task_checks",
        "Reads the task's structured checklist. A Markdown checklist may also be in details.",
        json!({"task_id":uuid}),
        vec!["task_id"],
        true,
        true,
        false,
    );
    add(
        "add_task_check",
        "Adds a structured check to the task.",
        json!({"task_id":uuid,"title":text}),
        vec!["task_id", "title"],
        true,
        false,
        false,
    );
    add(
        "update_task_check",
        "Edits a check's title or completion.",
        json!({"task_id":uuid,"check_id":uuid,"title":text,"is_complete":{"type":"boolean"}}),
        vec!["task_id", "check_id"],
        true,
        false,
        false,
    );
    add(
        "delete_task_check",
        "Deletes a structured check from the task.",
        json!({"task_id":uuid,"check_id":uuid}),
        vec!["task_id", "check_id"],
        true,
        false,
        true,
    );
    add("attach_document","Attaches to the task a Markdown note (.md) that already exists in the project's notes folder (notes_folder in get_context). path is relative to that folder or absolute inside it. The task keeps only the path; the person reads and edits the note in Trama. Logs it in the activity.",json!({"task_id":uuid,"path":text}),vec!["task_id","path"],true,false,false);
    add(
        "detach_document",
        "Detaches a note from the task without deleting the file.",
        json!({"task_id":uuid,"path":text}),
        vec!["task_id", "path"],
        true,
        false,
        false,
    );
    add(
        "list_task_documents",
        "Lists the notes attached to the task, with paths relative to the project's notes folder.",
        json!({"task_id":uuid}),
        vec!["task_id"],
        true,
        true,
        false,
    );
    add(
        "read_task_events",
        "Reads the immutable history of creation, changes and deliveries, paginated with limit/offset.",
        json!({"task_id":uuid,"limit":limit,"offset":offset}),
        vec!["task_id"],
        true,
        true,
        false,
    );
    add("git_snapshot","Reads branches, commits, local changes and the relation to main/master in the connected repository.",json!({"limit":limit}),vec![],true,true,false);
    add(
        "git_commit_details",
        "Reads a commit's message and patch from the connected repository.",
        json!({"commit_id":text}),
        vec!["commit_id"],
        true,
        true,
        false,
    );
    add(
        "git_working_diff",
        "Reads the connected repository's local changes without changing files.",
        json!({}),
        vec![],
        true,
        true,
        false,
    );
    add("list_pull_requests","Reads PRs, reviews and checks through the signed-in GitHub CLI. Returns unavailable when the provider can't be reached.",json!({}),vec![],true,true,false);
    all
}
pub fn validate(args: &Value, schema: &Value) -> Result<()> {
    let properties = schema["properties"].as_object().unwrap();
    for required in schema["required"].as_array().unwrap() {
        let key = required.as_str().unwrap();
        if args.get(key).is_none() {
            return Err(format!("{key} is required."));
        }
    }
    for (key, v) in args.as_object().unwrap() {
        let Some(p) = properties.get(key) else {
            return Err(format!("Invalid arguments: unexpected field: {key}"));
        };
        let matches = |t: &str| match t {
            "string" => v.is_string(),
            "integer" => v.as_i64().is_some(),
            "boolean" => v.is_boolean(),
            "null" => v.is_null(),
            _ => false,
        };
        let valid = if let Some(t) = p["type"].as_str() {
            matches(t)
        } else {
            p["type"]
                .as_array()
                .unwrap()
                .iter()
                .any(|t| matches(t.as_str().unwrap()))
        };
        if !valid {
            return Err(format!("Invalid type for {key}."));
        }
        if let Some(choices) = p["enum"].as_array() {
            if !choices.contains(v) {
                return Err(format!("Invalid value for {key}."));
            }
        }
        if let Some(n) = v.as_i64() {
            if p["minimum"].as_i64().is_some_and(|min| n < min)
                || p["maximum"].as_i64().is_some_and(|max| n > max)
            {
                return Err(format!("{key} is outside the allowed range."));
            }
        }
        if p["format"] == "uuid" {
            if let Some(s) = v.as_str() {
                uuid::Uuid::parse_str(s).map_err(|_| format!("{key} must be a valid UUID."))?;
            }
        }
    }
    Ok(())
}
