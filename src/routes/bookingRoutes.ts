import { Router } from "express";
import {
    getServices,
    getAvailability,
    createAppointment,
    getStaff,
    seedDatabase
} from "../controllers/bookingController";

const router = Router();

router.get("/services", getServices);
router.get("/staff", getStaff);
router.get("/availability", getAvailability);
router.post("/appointments", createAppointment);
router.post("/demo/seed", seedDatabase);

export default router;
