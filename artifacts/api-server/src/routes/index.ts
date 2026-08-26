import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clientsRouter from "./clients";
import devicesRouter from "./devices";
import mediaRouter from "./media";
import playlistsRouter from "./playlists";
import playbackRouter from "./playback";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(mediaRouter);
router.use(playlistsRouter);
router.use(playbackRouter);
router.use(dashboardRouter);
router.use(reportsRouter);

export default router;
