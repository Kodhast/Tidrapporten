#!/usr/bin/env bash
# Sets up the daily backup (decision 0018, issue 21): Firestore's own scheduled backups with
# 30 days' retention, and point-in-time recovery in drift. Run once per project in Cloud Shell
# by someone who owns the project:
#   bash scripts/backup.sh test
#   bash scripts/backup.sh drift
# Safe to run again: an existing schedule is left as it is.
#   bash scripts/backup.sh prova
# restores the newest backup in test to a new database, counts the documents per collection in
# both, and deletes the restored database again.
set -euo pipefail
test_project=dagboken-497114
db='(default)'

# The collections in src/data/export.ts; the count includes every user's documents.
collections=(employers customers assignments codes receivers absenceTypes freeDays entries pauses reports changeLog devices state)

count() { # project database collection
  curl -s -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H 'content-type: application/json' \
    "https://firestore.googleapis.com/v1/projects/$1/databases/$2/documents:runAggregationQuery" \
    -d "{\"structuredAggregationQuery\":{\"structuredQuery\":{\"from\":[{\"collectionId\":\"$3\",\"allDescendants\":true}]},\"aggregations\":[{\"alias\":\"n\",\"count\":{}}]}}" |
    grep -o '"integerValue": *"[0-9]*"' | grep -o '[0-9]*' || echo 0
}

if [ "${1:-}" = prova ]; then
  restored=aterstallning-prov
  backup=$(gcloud firestore backups list --location=europe-west1 --project="$test_project" \
    --format='value(name)' --sort-by=~snapshotTime --limit=1)
  [ -n "$backup" ] || { echo "Ingen backup i test än." >&2; exit 1; }
  echo "Återställer $backup till $restored …"
  op=$(gcloud firestore databases restore --source-backup="$backup" \
    --destination-database="$restored" --project="$test_project" --format='value(name)')
  # The restore runs on after the command; wait until its own operation is done (at most 20
  # minutes). Counting or deleting before that fails: the database answers FAILED_PRECONDITION.
  done_=''
  for _ in $(seq 120); do
    done_=$(gcloud firestore operations describe "$op" --format='value(done)' 2>/dev/null || true)
    [ "$done_" = True ] && break
    sleep 10
  done
  if [ "$done_" != True ]; then
    echo "Återställningen är inte klar efter 20 minuter; $restored finns kvar. Kör om prova senare," >&2
    echo "eller radera den: gcloud firestore databases delete --database=$restored --project=$test_project" >&2
    exit 1
  fi
  ok=true
  for c in "${collections[@]}"; do
    a=$(count "$test_project" "$db" "$c")
    b=$(count "$test_project" "$restored" "$c")
    echo "$c: databasen $a, återställd $b"
    [ "$a" = "$b" ] || ok=false
  done
  gcloud firestore databases delete --database="$restored" --project="$test_project" --quiet
  # Documents written since the backup make the live count higher; that is not a fault.
  $ok && echo "Antalen stämmer." || echo "Antalen skiljer sig; kontrollera om något skrivits sedan backupen."
  exit 0
fi

case "${1:-}" in
  test) project=$test_project ;;
  drift) project=device-streaming-5b35f7b8 ;;
  *)
    echo "Ange test, drift eller prova." >&2
    exit 1
    ;;
esac
if gcloud firestore backups schedules list --database="$db" --project="$project" \
  --format='value(recurrence)' | grep -q .; then
  echo "Det finns redan ett backupschema i $1:"
else
  gcloud firestore backups schedules create --database="$db" --recurrence=daily \
    --retention=30d --project="$project"
fi
gcloud firestore backups schedules list --database="$db" --project="$project"
if [ "$1" = drift ]; then
  gcloud firestore databases update --database="$db" --enable-pitr --project="$project"
fi
