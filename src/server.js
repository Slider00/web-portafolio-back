import dotenvSafe from "dotenv-safe";
import { app } from "./app.js";

dotenvSafe.config();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
