
import {hashPassword} from "../utils/helper.js";
const password = "xxxxxxxxxx"; // CHANGE THIS

const run = async () => {
    const hash = hashPassword(password);
  console.log("PASSWORD:", password);
  console.log("HASH:", hash);
};

run();
