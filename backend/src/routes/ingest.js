import { Router } from "express";
import { ingestHandler } from "../services/ingestion.js";

const router = Router();

// POST /api/ingest — external SDK can push logs here
router.post("/", ingestHandler);

export default router;
