# Where the functions run

`vercel.json` pins `"regions": ["bom1"]`. This note is why, because `vercel.json`
is JSON and cannot hold a comment — the schema sets `additionalProperties: false`,
so a `"//"` key is not a comment, it is a build failure.

## The reason

The Supabase project is in `ap-south-1` (Mumbai). Without the `regions` key,
Vercel placed every function in `iad1` (Washington DC). It was visible on any
response:

```
X-Vercel-Id: bom1::iad1::…
```

An Indian edge accepting the request and handing it to a North American
function, which then queried a database back in India. Every round trip
crossed an ocean — roughly 230ms each, against about 15ms for the same query
measured from Mumbai. A dashboard render makes a lot of round trips, and that
distance was most of what "the site feels slow" meant.

`bom1` is Vercel's Mumbai region, the one `ap-south-1` sits in. The Upstash
cache is in the same part of the world, so this shortens that leg too.

## If the database moves

Move this with it. The region and the database location are one decision, and
splitting them is what the 230ms was. Note that the project settings in the
Vercel dashboard can also carry a region — if the two ever disagree, check
there before assuming this file is being read.

## Changing this file

The published schema is at `https://openapi.vercel.sh/vercel.json` and rejects
any key it does not know. Validate before pushing rather than finding out in a
production deploy:

```bash
curl -sL https://openapi.vercel.sh/vercel.json -o /tmp/vercel-schema.json
python -c "import json;s=json.load(open('/tmp/vercel-schema.json'));c=json.load(open('vercel.json'));e=[k for k in c if k not in s['properties']];print('unknown keys:', e or 'none')"
```
