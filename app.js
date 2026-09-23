import express from "express";
import cors from "cors";
import authRoutes from "./src/modules/auth/auth.routes.js";
import employeeRoutes from "./src/modules/employee/employee.routes.js";
import deviceRoutes from "./src/modules/device/device.routes.js"

const app = express();

app.use(cors());
app.use(express.json());

// NOTE: mounted at "/api" only - each *.routes.js already defines its own
// full sub-path (e.g. "/auth/login", "/admin/employees"), so mounting at
// "/api/auth" here would produce "/api/auth/auth/login".
app.use("/api", authRoutes);
app.use("/api", employeeRoutes);
app.use("/api", deviceRoutes);
// app.use("/api", attendanceRoutes);
// app.use("/api", leaveRoutes);
// app.use("/api", holidayRoutes);

// must be registered LAST, after all routes
// app.use(errorHandler);

export default app;