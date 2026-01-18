import { Router } from "express";
import {
    getServices,
    getAvailability,
    createAppointment,
    getStaff,
    seedDatabase,
    getAppointments, // 👈 AÑADE ESTO
} from "../controllers/bookingController";

const router = Router();

router.get("/services", getServices);
router.get("/staff", getStaff);
router.get("/availability", getAvailability);
router.post("/appointments", createAppointment);
router.get("/appointments", getAppointments); // ✅ NUEVO
router.get("/demo/seed", seedDatabase);
router.post("/demo/seed", seedDatabase);


export default router;
