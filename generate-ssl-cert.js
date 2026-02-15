import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certDir = path.join(__dirname, "ssl");

// Create ssl directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
  console.log("✅ Created ssl directory");
}

const keyPath = path.join(certDir, "localhost-key.pem");
const certPath = path.join(certDir, "localhost-cert.pem");

try {
  // Check if OpenSSL is available
  try {
    execSync("openssl version", { stdio: "ignore" });
  } catch {
    console.error("❌ OpenSSL is not installed or not in PATH");
    console.log("\n📝 On Windows, you can:");
    console.log("1. Install Git for Windows (includes OpenSSL)");
    console.log("2. Or use the Node.js method below\n");
    process.exit(1);
  }

  // Generate self-signed certificate using OpenSSL
  const command = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout "${keyPath}" -out "${certPath}" -days 365`;

  execSync(command, { stdio: "inherit" });

  console.log("\n✅ SSL certificates generated successfully!");
  console.log(`📄 Private Key: ${keyPath}`);
  console.log(`📄 Certificate: ${certPath}`);
  console.log(
    "\n⚠️  Note: These are self-signed certificates for testing only.",
  );
  console.log(
    "Your browser will show a security warning - this is normal for self-signed certs.",
  );
  console.log("\n📝 Next steps:");
  console.log("1. Update your .env file with:");
  console.log(`   HTTPS_KEY_PATH=ssl/localhost-key.pem`);
  console.log(`   HTTPS_CERT_PATH=ssl/localhost-cert.pem`);
  console.log(
    '2. Set ENVIRONMENT to "product" or "developingURL" to enable HTTPS',
  );
} catch (error) {
  console.error("❌ Error generating certificates:", error.message);
  process.exit(1);
}
