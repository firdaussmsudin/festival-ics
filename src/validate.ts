import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

async function main() {
  const [schemaRaw, dataRaw] = await Promise.all([
    readFile("data/festival.schema.json", "utf-8"),
    readFile("data/festivals.json", "utf-8"),
  ]);

  const schema = JSON.parse(schemaRaw);
  const data = JSON.parse(dataRaw);

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data);

  // Extra checks Ajv's schema alone can't express:
  const errors: string[] = [];
  const uids = new Set<string>();
  for (const f of data.festivals ?? []) {
    if (uids.has(f.uid)) errors.push(`Duplicate uid: ${f.uid}`);
    uids.add(f.uid);

    if (f.startDate && f.endDate && f.startDate > f.endDate) {
      errors.push(`${f.uid}: startDate (${f.startDate}) is after endDate (${f.endDate})`);
    }
  }

  if (!valid) {
    console.error("Schema validation failed:");
    for (const e of validateFn.errors ?? []) {
      console.error(`  - ${e.instancePath || "(root)"}: ${e.message}`);
    }
  }

  if (errors.length) {
    console.error("Additional checks failed:");
    for (const e of errors) console.error(`  - ${e}`);
  }

  if (!valid || errors.length) {
    process.exit(1);
  }

  console.log(`OK — ${data.festivals.length} entries validated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
