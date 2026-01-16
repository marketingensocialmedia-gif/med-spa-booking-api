import { Router } from "express";
import {
    getServices,
    getAvailability,
    createAppointment,
} from "../controllers/bookingController";

const router = Router();

router.get("/services", getServices);
router.get("/availability", getAvailability);
router.post("/appointments", createAppointment);

export default router;
