import { hashPassword } from "../utils/helper.js";
const password = "@#dana56Zrar"; // CHANGE THIS

const run = async () => {
  const hash = hashPassword(password);
};

run();
