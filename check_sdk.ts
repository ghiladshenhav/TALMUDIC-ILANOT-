
import { GoogleGenAI } from "@google/genai";

console.log("Checking GoogleGenAI prototype...");
const client = new GoogleGenAI({ apiKey: "test" });
console.log("Client keys:", Object.keys(client));
if (client.files) {
    console.log("client.files exists!");
} else {
    console.log("client.files DOES NOT exist.");
}
