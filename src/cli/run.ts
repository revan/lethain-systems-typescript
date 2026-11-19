import { parseArgs } from "node:util";
import { ParseException } from "../errors.js";
import { parse } from "../parse.js";
import { print, readStdin, runMain } from "./common.js";

const USAGE = "usage: systems-run [-h] [-r ROUNDS] [--csv]";

function usageError(msg: string): never {
  process.stderr.write(`${USAGE}\nsystems-run: error: ${msg}\n`);
  process.exit(2);
}

runMain(() => {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        rounds: { type: "string", short: "r", default: "10" },
        csv: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (err) {
    usageError(err instanceof Error ? err.message : String(err));
  }
  if (values.help) {
    print(
      `${USAGE}\n\noptions:\n  -h, --help            show this help message and exit\n` +
        `  -r, --rounds ROUNDS   number of rounds to run evaluation\n  --csv`,
    );
    return;
  }
  if (!/^\s*[-+]?\d+\s*$/.test(values.rounds)) {
    usageError(`argument -r/--rounds: invalid int value: '${values.rounds}'`);
  }
  const rounds = Number.parseInt(values.rounds, 10);

  const txt = readStdin();
  let model;
  try {
    model = parse(txt);
  } catch (err) {
    if (err instanceof ParseException) {
      print(err.str());
      return;
    }
    throw err;
  }

  const results = model.run(rounds);
  print(values.csv ? model.render(results, ",", false) : model.render(results));
});
