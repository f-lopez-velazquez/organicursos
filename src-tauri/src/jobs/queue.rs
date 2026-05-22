use anyhow::Result;
use uuid::Uuid;

use crate::db::Database;

pub fn create_job(
    database: &Database,
    kind: &str,
    target: Option<&str>,
    payload_json: Option<&str>,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    database.queue_job(&id, kind, target, payload_json)?;
    Ok(id)
}
