import { ParseException } from "../errors.js";
import { parse } from "../parse.js";
import { asDot } from "../viz.js";
import { print, readStdin, runMain } from "./common.js";

runMain(() => {
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
  print(asDot(model).source);
});
