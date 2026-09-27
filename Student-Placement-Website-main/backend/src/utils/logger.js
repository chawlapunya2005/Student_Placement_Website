export function logAction(action, details = {}) {
  console.log(`[action] ${new Date().toISOString()} ${action}`, details);
}
