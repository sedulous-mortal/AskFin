import fs from "fs";

const KEY = "3829347201";
const savePath =
  "../../client-files/GrimshireSaves/ExampleSave.grimshire";

const buffer = fs.readFileSync(savePath);

let encryptedText = "";

for (const byte of buffer) {
  encryptedText += String.fromCharCode(byte);
}

// let decrypted = "";

// for (let i = 0; i < encryptedText.length; i++) {
//   decrypted += String.fromCharCode(
//     encryptedText.charCodeAt(i) ^
//       KEY.charCodeAt(i % KEY.length)
//   );
// }

// fs.writeFileSync("decoded-save.json", decrypted);

// const encrypted = fs.readFileSync(savePath);
// const lastBrace = decrypted.lastIndexOf("}");

// console.log("Last brace:", lastBrace);

// const trimmed = decrypted.slice(0, lastBrace + 1);

function xor(text) {
  let result = "";

  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^
      KEY.charCodeAt(i % KEY.length)
    );
  }

  return result;
}

const original = '{\n    "fileName":';

const encrypted = xor(original);
const decrypted = xor(encrypted);

console.log(original === decrypted);