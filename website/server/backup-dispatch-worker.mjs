// Free-plan cron only starts the restricted runner; bulk exports/encryption run
// outside the 10 ms request budget. No public route or administrative endpoint.
export default {
  fetch() { return new Response('Not found', { status: 404 }); },
  async scheduled(_event, env) {
    if (env.BACKUP_TRIGGER_ENABLED !== 'true') return;
    if (!env.BACKUP_ACTIONS_TOKEN || env.BACKUP_WORKFLOW_REF !== 'main') throw new Error('Configure the approved protected backup workflow and restricted dispatch credential.');
    const response = await fetch('https://api.github.com/repos/joshuamaziarz1-ux/rise-and-roost-register/actions/workflows/production-business-backup.yml/dispatches', {
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer ' + env.BACKUP_ACTIONS_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Rise-Roost-private-backup-dispatcher', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: env.BACKUP_WORKFLOW_REF }),
    });
    if (response.status !== 204) throw new Error('Daily backup dispatch was not accepted. Check the private scheduler and missing-success monitor.');
    // Dispatch acceptance is not a successful backup. Only the runner sends the
    // success heartbeat, after encrypted R2 read-back and integrity verification.
  },
};
