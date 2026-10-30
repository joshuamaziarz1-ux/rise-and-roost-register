"""Configure only the existing isolated preview's temporary Access gate.

Default: print a non-sensitive plan. --apply requires existing account-scoped
Access API permissions. No billing, DNS, D1, workspace or Worker writes occur.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request

HOST = 'rise-roost-experience-preview.joshua-maziarz1.workers.dev'
WORKER = 'rise-roost-experience-preview'
DATABASE = '21352b95-d7f6-406f-8527-4b8dbcebf1bf'
WORKSPACE = '2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204'
SESSION = '720h'


class ApiError(Exception):
    def __init__(self, status, errors):
        self.status, self.errors = status, errors
        super().__init__(f'Cloudflare HTTP {status}: ' + json.dumps(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--testers', required=True, type=Path, help='Private JSON file with an emails array; never commit it')
    parser.add_argument('--state-dir', required=True, type=Path, help='Private directory outside the repository')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[2]
    if args.testers.resolve().is_relative_to(repository) or args.state_dir.resolve().is_relative_to(repository):
        raise ValueError('Tester details and private Access snapshots must stay outside the repository.')
    testers = json.loads(args.testers.read_text())['emails']
    if not isinstance(testers, list) or len(testers) != 2 or any(not isinstance(e, str) or not re.fullmatch(r'[^\s@*]+@[^\s@*.]+(?:\.[^\s@*.]+)+', e) for e in testers):
        raise ValueError('Supply exactly the two explicitly approved tester emails.')
    testers = sorted({e.strip().lower() for e in testers})
    if len(testers) != 2:
        raise ValueError('The two approved addresses must be distinct.')
    if not args.apply:
        print(json.dumps({'mode': 'plan', 'worker': WORKER, 'hostname': HOST, 'approvedTesterCount': 2, 'sessionHours': 720, 'ipRestrictions': False,
                          'scope': 'This hostname only; no all-Worker policy, billing, DNS, D1, workspace, or deployment changes',
                          'requiredAccountPermissions': ['Access: Apps and Policies — Edit', 'Access: Organizations, Identity Providers, and Groups — Edit']}))
        return
    account, token = os.environ['CLOUDFLARE_ACCOUNT_ID'], os.environ['CLOUDFLARE_API_TOKEN']
    root = 'https://api.cloudflare.com/client/v4/accounts/' + account

    def cf(path, body=None):
        req = urllib.request.Request(root + path, method='POST' if body is not None else 'GET',
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result, status = json.load(response), response.status
        except urllib.error.HTTPError as error:
            status = error.code
            try:
                result = json.load(error)
            except Exception:
                result = {}
        if not result.get('success'):
            raise ApiError(status, result.get('errors', []))
        return result.get('result')

    def collection(path):
        # Do not overlook another app or a second policy beyond the first page.
        values, seen = [], set()
        for page in range(1, 101):
            batch = cf(path + '?per_page=100&page=' + str(page))
            if not isinstance(batch, list):
                raise ValueError('Cloudflare returned an unexpected collection; no configuration will be overwritten.')
            for value in batch:
                if not value.get('id') or value['id'] in seen:
                    raise ValueError('Cloudflare pagination could not be verified; review before continuing.')
                seen.add(value['id'])
                values.append(value)
            if len(batch) < 100:
                return values
        raise ValueError('Cloudflare collection exceeds the safe review limit.')

    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    def private_save(name, value):
        path = args.state_dir / name
        # Preserve each original result for review and idempotent continuation.
        if path.exists():
            if json.loads(path.read_text()) != value:
                path = args.state_dir / (name + '.' + hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:12])
        if not path.exists():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as output:
                json.dump(value, output, indent=2)
        return path

    # Verify the real deployed binding, not a user-supplied marker alone.
    settings = cf('/workers/scripts/' + WORKER + '/settings')
    binding = {b['name']: b for b in settings['bindings']}
    if binding.get('DB', {}).get('id') != DATABASE or binding.get('PUBLIC_WORKSPACE_ID', {}).get('text') != WORKSPACE or binding.get('ORDER_EMAIL_ENABLED', {}).get('text') != 'false' or any(binding.get(flag, {}).get('text') != 'true' for flag in ['CUSTOMER_EXPERIENCE_ENABLED', 'REVIEW_BUILD', 'STUDIO_MANAGEMENT_ENABLED']):
        raise ValueError('Unexpected preview data binding; no Access changes were made.')
    subdomain = cf('/workers/scripts/' + WORKER + '/subdomain')
    if subdomain.get('previews_enabled') is not False:
        raise ValueError('Worker version preview URLs must remain disabled before configuring Access.')

    try:
        organization = cf('/access/organizations')
    except ApiError as error:
        if error.status == 404 or any(e.get('code') == 9999 and 'not_enabled' in str(e.get('message')) for e in error.errors):
            organization = None
        else:
            raise
    if not organization:
        # Creates an organization, never selects/upgrades a paid subscription.
        # Stop on any onboarding/subscription requirement; do not call billing.
        suffix = hashlib.sha256(account.encode()).hexdigest()[:6]
        organization = cf('/access/organizations', {'name': 'Rise & Roost Studio Testing', 'auth_domain': 'rise-roost-testing-' + suffix + '.cloudflareaccess.com', 'session_duration': SESSION})
        private_save('created-organization.json', organization)
    team = organization.get('auth_domain', '')
    if not re.fullmatch(r'[a-z0-9-]+\.cloudflareaccess\.com', team):
        raise ValueError('Unexpected Access team domain; existing organization was not modified.')

    # Never add an OTP provider to an organization with unrelated apps unless
    # that method already exists; adding a global login method could affect them.
    apps, idps = collection('/access/apps'), collection('/access/identity_providers')
    matching = [app for app in apps if app.get('domain') == HOST]
    if len(matching) > 1:
        raise ValueError('Multiple Access apps match the preview; review routing before proceeding.')
    otp = next((p for p in idps if p.get('type') == 'onetimepin'), None)
    if not otp:
        if any(app.get('domain') != HOST for app in apps):
            raise ValueError('Other Access apps exist; review their login-method scope before adding OTP. None were changed.')
        otp = cf('/access/identity_providers', {'name': 'Rise & Roost testing email', 'type': 'onetimepin', 'config': {}})
        private_save('created-otp-provider.json', otp)
    if matching:
        application = cf('/access/apps/' + matching[0]['id'])
        private_save('existing-preview-application.json', application)
    else:
        application = cf('/access/apps', {
            'type': 'self_hosted', 'name': 'Rise & Roost Studio Testing', 'domain': HOST,
            'session_duration': SESSION, 'http_only_cookie': True, 'same_site_cookie_attribute': 'lax',
            'app_launcher_visible': False, 'allowed_idps': [otp['id']], 'auto_redirect_to_identity': False,
            'policies': [{'name': 'Approved Rise & Roost testers', 'decision': 'allow', 'precedence': 1,
                          'include': [{'email': {'email': email}} for email in testers], 'exclude': [], 'require': [], 'session_duration': SESSION}],
        })
        private_save('created-preview-application.json', application)
    application = cf('/access/apps/' + application['id'])
    policies = collection('/access/apps/' + application['id'] + '/policies')
    # Reuse only the exact requested configuration; never overwrite other apps,
    # expand an allow rule, or silently remove an existing authentication policy.
    if application.get('domain') != HOST or application.get('type') != 'self_hosted' or application.get('session_duration') != SESSION or application.get('allowed_idps') != [otp['id']]:
        raise ValueError('Preview Access configuration differs from the plan; review it before deployment.')
    for destination in application.get('destinations') or []:
        if destination.get('type') != 'public' or destination.get('uri') not in [HOST, 'https://' + HOST]:
            raise ValueError('Access app has an additional destination; no Worker deployment is authorized.')
    if len(policies) != 1:
        raise ValueError('The preview must have exactly one allow policy and no bypass/service policies.')
    policy = policies[0]
    included = sorted(rule.get('email', {}).get('email', '').lower() for rule in policy.get('include', []))
    if policy.get('decision') != 'allow' or included != testers or any(set(rule) != {'email'} for rule in policy.get('include', [])) or policy.get('exclude') or policy.get('require') or policy.get('session_duration') != SESSION:
        raise ValueError('Preview policy must allow only the two approved emails with remembered sessions; no policy was overwritten.')
    if not re.fullmatch(r'[a-f0-9]{64}', application.get('aud', '')):
        raise ValueError('The application audience could not be verified.')
    metadata = {'application': application, 'policies': policies, 'organization': organization, 'otpProviderId': otp['id']}
    private_save('verified-access.json', metadata)
    private_save('worker-access-settings.json', {'CF_ACCESS_TEAM_DOMAIN': 'https://' + team, 'CF_ACCESS_AUD': application['aud'], 'PREVIEW_DATABASE_ID': DATABASE, 'PREVIEW_ACCESS_MODE': 'cloudflare-access'})
    print(json.dumps({'accessPolicyVerified': True, 'hostname': HOST, 'approvedTesterCount': 2, 'sessionHours': 720, 'ipRestrictions': False,
                      'workerDeployed': False, 'databaseWrites': 0, 'unrelatedAppsChanged': 0, 'billingChanges': 0}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error)
        for value in [os.environ.get('CLOUDFLARE_API_TOKEN'), os.environ.get('CLOUDFLARE_ACCOUNT_ID')]:
            if value:
                message = message.replace(value, '[redacted]')
        message = re.sub(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email redacted]', message)
        print(json.dumps({'setupComplete': False, 'error': message, 'workerDeployed': False}))
        raise SystemExit(1)
