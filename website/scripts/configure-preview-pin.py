"""Prepare PIN authentication ONLY on the existing isolated experience preview.

Default is an offline plan. --apply backs up the existing D1 data, creates only
three additive auth tables, installs a random Worker pepper and saves a private,
single-use setup capability. It never chooses, displays or stores an owner PIN.
"""
import argparse,datetime,hashlib,json,os,re,secrets,sqlite3,urllib.request,urllib.error
from pathlib import Path
HOST='rise-roost-experience-preview.joshua-maziarz1.workers.dev'
WORKER='rise-roost-experience-preview'
DATABASE='21352b95-d7f6-406f-8527-4b8dbcebf1bf'
WORKSPACE='2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204'

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--state-dir',required=True,type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 repository=Path(__file__).resolve().parents[2]
 if args.state_dir.resolve().is_relative_to(repository):raise ValueError('Private state must stay outside the repository.')
 if not args.apply:
  print(json.dumps({'mode':'plan','worker':WORKER,'database':'rise-roost-experience-preview-db','backupBeforeChanges':True,'additiveAuthTables':3,'ownerPinChosenPrivately':True,'workspacesCreated':0,'businessWrites':0,'deployment':False}));return
 root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']
 def cf(path,body=None,method=None):
  req=urllib.request.Request(root+path,method=method or ('POST' if body is not None else 'GET'),headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
  try:
   with urllib.request.urlopen(req,timeout=40) as r:d=json.load(r)
  except urllib.error.HTTPError as e:raise RuntimeError('Cloudflare HTTP '+str(e.code)+': '+json.dumps(json.load(e).get('errors',[]))) from None
  if not d.get('success'):raise RuntimeError('Cloudflare rejected the request: '+json.dumps(d.get('errors',[])))
  return d['result']
 def query(sql,params=None):return cf('/d1/database/'+DATABASE+'/query',{'sql':sql,'params':params or []})[0]['results']
 def private(name,data):
  p=args.state_dir/name
  fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump(data,f,indent=2)
  return p
 if cf('/tokens/verify')['status']!='active':raise ValueError('Account token is not active.')
 settings=cf('/workers/scripts/'+WORKER+'/settings');bindings={b['name']:b for b in settings['bindings']}
 if bindings.get('DB',{}).get('id')!=DATABASE or bindings.get('PUBLIC_WORKSPACE_ID',{}).get('text')!=WORKSPACE or bindings.get('ORDER_EMAIL_ENABLED',{}).get('text')!='false' or any(bindings.get(k,{}).get('text')!='true' for k in ['REVIEW_BUILD','CUSTOMER_EXPERIENCE_ENABLED','STUDIO_MANAGEMENT_ENABLED']):raise ValueError('Preview isolation could not be verified; no changes made.')
 if cf('/workers/scripts/'+WORKER+'/subdomain').get('previews_enabled') is not False:raise ValueError('Alternate version URLs must stay disabled.')
 args.state_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
 schema=query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
 existing=query("SELECT * FROM studio_pin_settings WHERE id='main'") if any(t['name']=='studio_pin_settings' for t in schema) else []
 if existing and existing[0]['pin_hash']:raise ValueError('A PIN is already configured. Preserve it; rotation needs a separate owner-authorized operation.')
 state_path=args.state_dir/'owner-setup.json'
 if state_path.exists():state=json.loads(state_path.read_text())
 else:
  if existing:raise ValueError('Existing PIN setup state has no matching private recovery file. Nothing was reset.')
  if 'STUDIO_PIN_PEPPER' in bindings:raise ValueError('Existing PIN secret has no matching private state. Nothing was overwritten.')
  now=datetime.datetime.now(datetime.timezone.utc)
  state={'pepper':secrets.token_hex(32),'setupToken':secrets.token_hex(32),'setupExpires':int((now+datetime.timedelta(days=1)).timestamp()*1000),'previewUntil':(now+datetime.timedelta(days=30)).isoformat(timespec='seconds').replace('+00:00','Z')}
  state['setupUrl']='https://'+HOST+'/studio/setup#setup='+state['setupToken'];private('owner-setup.json',state)
 if state['setupExpires']<=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000):raise ValueError('The prepared setup capability expired. Do not reset existing access silently.')
 setup_hash=hashlib.sha256(state['setupToken'].encode()).hexdigest()
 if existing and existing[0]['bootstrap_hash']!=setup_hash:raise ValueError('The database has different setup details. Nothing was overwritten.')
 backup_path=args.state_dir/'before-d1.json'
 if not backup_path.exists():
  tables=[]
  for table in schema:
   name=table['name']
   if not re.fullmatch(r'[A-Za-z0-9_]+',name):raise ValueError('Unexpected table name; stop before changes.')
   rows=query('SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' if name=='assets' else 'SELECT * FROM "'+name+'"')
   tables.append({**table,'rows':rows})
  backup={'format':'private-preview-d1-snapshot-v1','tables':tables};private('before-d1.json',backup)
 else:backup=json.loads(backup_path.read_text())
 restored=sqlite3.connect(':memory:');restored.row_factory=sqlite3.Row
 for table in backup['tables']:
  restored.execute(table['sql'])
  for row in table['rows']:
   row=dict(row)
   if table['name']=='assets':row['bytes']=bytes.fromhex(row.pop('bytes_hex'))
   columns=list(row);restored.execute('INSERT INTO "'+table['name']+'"('+','.join('"'+k+'"' for k in columns)+') VALUES('+','.join('?' for k in columns)+')',[row[k] for k in columns])
  assert restored.execute('SELECT count(*) FROM "'+table['name']+'"').fetchone()[0]==len(table['rows'])
 workspace_rows=next(t['rows'] for t in backup['tables'] if t['name']=='workspaces')
 restored_rows=[dict(r) for r in restored.execute('SELECT * FROM workspaces')]
 assert sorted(restored_rows,key=lambda r:r['id'])==sorted(workspace_rows,key=lambda r:r['id'])
 main=next(r for r in workspace_rows if r['id']==WORKSPACE)
 if any(o.get('simulated') is not True for o in json.loads(main['ledger_json']).get('orders',[])):raise ValueError('Main preview includes a non-simulated order; review data separation before proceeding.')
 # Only these additive CREATE statements and the auth-only INSERT are permitted.
 for statement in (repository/'website/pin-schema.sql').read_text().split(';'):
  statement='\n'.join(line for line in statement.splitlines() if not line.lstrip().startswith('--')).strip()
  if statement:
   if not statement.startswith('CREATE TABLE IF NOT EXISTS studio_pin_'):raise ValueError('Unexpected migration statement.')
   query(statement)
 query("INSERT INTO studio_pin_settings(id,bootstrap_hash,bootstrap_expires) VALUES('main',?,?) ON CONFLICT(id) DO NOTHING",[setup_hash,state['setupExpires']])
 row=query("SELECT * FROM studio_pin_settings WHERE id='main'")[0]
 if row['bootstrap_hash']!=setup_hash or row['pin_hash']:raise ValueError('Setup row differs; no secret was changed.')
 cf('/workers/scripts/'+WORKER+'/secrets',{'name':'STUDIO_PIN_PEPPER','type':'secret_text','text':state['pepper']},'PUT')
 # Compare every original business table after preparation, including old sessions.
 for table in backup['tables']:
  if table['name'].startswith('studio_pin_'):continue
  current=query('SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' if table['name']=='assets' else 'SELECT * FROM "'+table['name']+'"')
  canonical=lambda rows:sorted(json.dumps(r,sort_keys=True) for r in rows)
  if canonical(current)!=canonical(table['rows']):raise ValueError('Existing data changed during setup. Inspect without overwriting anything.')
 print(json.dumps({'prepared':True,'worker':WORKER,'database':'rise-roost-experience-preview-db','privateBackupRestoredLocally':True,'tablesBackedUp':len(backup['tables']),'workspaceCountPreserved':len(workspace_rows),'existingBusinessTablesExactlyUnchanged':True,'additiveAuthTables':3,'workerPepperConfigured':True,'pinChosen':False,'privateSetupLinkSaved':True,'workspacesCreated':0,'businessWrites':0,'workerDeployed':False}))
if __name__=='__main__':
 try:main()
 except Exception as e:
  message=str(e)
  for value in [os.environ.get('CLOUDFLARE_API_TOKEN'),os.environ.get('CLOUDFLARE_ACCOUNT_ID')]:
   if value:message=message.replace(value,'[redacted]')
  message=re.sub(r'\b[a-f0-9]{48,}\b','[redacted]',message)
  print(json.dumps({'prepared':False,'error':message,'workerDeployed':False}));raise SystemExit(1)
