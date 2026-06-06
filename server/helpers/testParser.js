import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { parseSaveFile } from "./parseSaveFile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savePath = path.resolve(__dirname, "../../client-files/GrimshireSaves/ExampleSave.grimshire");

const buffer = fs.readFileSync(savePath);
const result = parseSaveFile(buffer);

console.log("Parsed save file:");
console.log(JSON.stringify(result, null, 2));
