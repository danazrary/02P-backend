import fs from "fs";
import path from "path";

export function deleteFile(filePath) {
  if (!filePath) return;

  const absolutePath = path.join(process.cwd(), filePath);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}
