import { runRoutine } from "./workbench-core.mjs";

const routine = process.argv[2];
if (!["audit", "gc"].includes(routine)) throw new Error("routine must be audit or gc");
const result = await runRoutine(routine);
process.stdout.write(`${result.stdout}\nIndexed ${result.indexed} active knowledge item${result.indexed === 1 ? "" : "s"}.\n`);
