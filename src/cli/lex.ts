import { lex } from "../lexer.js";
import { print, readStdin, runMain } from "./common.js";

// The Python version pretty-prints the token tuples with `pprint`; this port
// prints the same token structure as JSON instead.
runMain(() => {
  print(JSON.stringify(lex(readStdin()), null, 2));
});
