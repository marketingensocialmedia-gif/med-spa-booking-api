import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Helpers
 */
function parseDateOnly(input: unknown): string | null {
    if (typeof input !== "string") return null;
    // Acepta "YYYY-MM-DD" o ISO "YYYY-MM-DDTHH:mm..."
    const dateOnly = input.slice(0, 10);
    // Validación simple YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
    return dateOnly;
}

function isValidId(n: number) {
    return Number.isFinite(n) && n > 0;
}

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aDurationMin: number, bStart: Date, bDurationMin: number) {
    const aEnd = addMinutes(aStart, aDurationMin);
    const bEnd = addMinutes(bStart, bDurationMin);
    // overlap: (A starts before B ends) && (A ends after B starts)
    return aStart < bEnd && aEnd > bStart;
}

/**
 * GET /services
 */
export const getServices = async (req: Request, res: Response) => {
    try {
        const services = await prisma.service.findMany();
        return res.json(services);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch services" });
    }
};

/**
 * GET /availability
 * Query: serviceId, date (YYYY-MM-DD or ISO), staffId (optional)
 *
 * ✅ Devuelve slots cada 30 min
 * ✅ Si YA existe cita a esa hora para ese staff -> NO la muestra
 */
export const getAvailability = async (req: Request, res: Response) => {
    try {
        const serviceId = Number(req.query.serviceId);
        const dateOnly = parseDateOnly(req.query.date);

        // staffId opcional
        const staffIdQuery = req.query.staffId ? Number(req.query.staffId) : null;

        if (!isValidId(serviceId) || !dateOnly) {
            return res.status(400).json({ error: "Missing or invalid serviceId/date" });
        }

        // 1) Traemos el servicio para saber duración
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
        });

        if (!service) {
            return res.status(404).json({ error: "Service not found" });
        }

        // 2) Horario de trabajo (UTC)
        // Ajusta si quieres otro horario:
        const openHour = 8;   // 08:00
        const closeHour = 16; // 16:00 (último slot 15:00 si duración=60)

        const workStart = new Date(`${dateOnly}T${String(openHour).padStart(2, "0")}:00:00.000Z`);
        const workEnd = new Date(`${dateOnly}T${String(closeHour).padStart(2, "0")}:00:00.000Z`);

        // Rango completo del día (para filtrar citas)
        const dayStart = new Date(`${dateOnly}T00:00:00.000Z`);
        const dayEnd = new Date(`${dateOnly}T23:59:59.999Z`);

        // 3) Staffs a revisar
        const staffs =
            staffIdQuery && isValidId(staffIdQuery)
                ? await prisma.staff.findMany({ where: { id: staffIdQuery } })
                : await prisma.staff.findMany();

        if (!staffs.length) {
            return res.status(404).json({ error: "No staff found" });
        }

        // 4) Traemos citas existentes por staff (mismo día)
        const staffAppointmentsMap = new Map<number, any[]>();

        for (const staff of staffs) {
            const appts = await prisma.appointment.findMany({
                where: {
                    staffId: staff.id,
                    dateTime: { gte: dayStart, lte: dayEnd },
                },
                include: { service: true },
            });

            staffAppointmentsMap.set(staff.id, appts);
        }

        // 5) Generamos slots base (stride 30 minutos)
        const strideMinutes = 30;
        const availableSlots: string[] = [];

        let cursor = new Date(workStart);

        while (cursor < workEnd) {
            const slotStart = new Date(cursor);
            const slotEnd = addMinutes(slotStart, service.duration);

            // El servicio debe caber antes de cerrar
            if (slotEnd > workEnd) break;

            // ✅ Si staffId está especificado: solo revisa ese staff
            // ✅ Si no: basta con que AL MENOS 1 staff esté libre
            const slotIsAvailable = staffs.some((staff) => {
                const staffAppts = staffAppointmentsMap.get(staff.id) ?? [];

                const hasConflict = staffAppts.some((appt) => {
                    const apptStart = new Date(appt.dateTime);
                    const apptDuration = appt.service?.duration ?? service.duration;
                    return overlaps(slotStart, service.duration, apptStart, apptDuration);
                });

                return !hasConflict;
            });

            if (slotIsAvailable) {
                availableSlots.push(slotStart.toISOString());
            }

            cursor = addMinutes(cursor, strideMinutes);
        }

        return res.json({
            date: dateOnly,
            availableSlots,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch availability" });
    }
};

/**
 * POST /appointments
 * Body: serviceId, staffId, startTime, clientName, clientEmail
 */
export const createAppointment = async (req: Request, res: Response) => {
    try {
        const { serviceId, staffId, startTime, clientName, clientEmail } = req.body;

        // Validate inputs
        if (!serviceId || !staffId || !startTime || !clientName || !clientEmail) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const serviceIdNum = Number(serviceId);
        const staffIdNum = Number(staffId);

        if (!isValidId(serviceIdNum) || !isValidId(staffIdNum)) {
            return res.status(400).json({ error: "Invalid serviceId/staffId" });
        }

        const start = new Date(startTime);
        if (isNaN(start.getTime())) {
            return res.status(400).json({ error: "Invalid startTime" });
        }

        const service = await prisma.service.findUnique({ where: { id: serviceIdNum } });
        if (!service) return res.status(404).json({ error: "Service not found" });

        const staff = await prisma.staff.findUnique({ where: { id: staffIdNum } });
        if (!staff) return res.status(404).json({ error: "Staff not found" });

        const end = addMinutes(start, service.duration);

        // Buscar citas del mismo staff ese día
        const dayStart = new Date(start);
        dayStart.setUTCHours(0, 0, 0, 0);

        const dayEnd = new Date(start);
        dayEnd.setUTCHours(23, 59, 59, 999);

        const existingAppts = await prisma.appointment.findMany({
            where: {
                staffId: staffIdNum,
                dateTime: { gte: dayStart, lte: dayEnd },
            },
            include: { service: true },
        });

        const hasConflict = existingAppts.some((appt) => {
            const existingStart = new Date(appt.dateTime);
            const existingDuration = appt.service?.duration ?? 0;
            return overlaps(start, service.duration, existingStart, existingDuration);
        });

        if (hasConflict) {
            return res.status(409).json({ error: "Time slot is not available" });
        }

        // Create appointment
        const appointment = await prisma.appointment.create({
            data: {
                dateTime: start,
                clientName,
                clientEmail,
                serviceId: serviceIdNum,
                staffId: staffIdNum,
            },
        });

        return res.status(201).json(appointment);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create appointment" });
    }
};