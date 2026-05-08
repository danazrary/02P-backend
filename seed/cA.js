import { hashPassword } from "../utils/helper.js";
const password = "test"; // CHANGE THIS

const run = async () => {
  const hash = hashPassword(password);
};

run();
