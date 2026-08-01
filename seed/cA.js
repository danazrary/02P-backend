import { hashPassword } from "../utils/helper.js";
import bcrypt from "bcrypt";
const password = "#00#AAbb"; // CHANGE THIS

const run = async () => {
 // const hashedPassword = await bcrypt.hash(password, 10);
 const hash = hashPassword(password);
  console.log("Hashed Password:", hashedPassword);

};
//node seed/cA.js

run();
