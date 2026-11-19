import { lex, readable } from "../lexer.js";
import { print, readStdin, runMain } from "./common.js";

runMain(() => {
  print(readable(lex(readStdin())));
});
