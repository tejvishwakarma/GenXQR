import { Router, type IRouter } from "express"
import authRouter from "./auth.routes.js"
import staticRouter from "./static.routes.js"
import publicRouter from "./public.routes.js"
import qrRouter from "./qr.routes.js"
import uploadRouter from "./upload.routes.js"
import analyticsRouter from "./analytics.routes.js"
import billingRouter from "./billing.routes.js"
import apikeysRouter from "./apikeys.routes.js"
import webhookRouter from "./webhook.routes.js"
import bulkRouter from "./bulk.routes.js"
import gdriveRouter from "./gdrive.routes.js"
import teamRouter from "./team.routes.js"
import reportRouter from "./report.routes.js"
import supportRouter from "./support.routes.js"
import careersRouter from "./careers.routes.js"
import notificationRouter from "./notification.routes.js"

const router: IRouter = Router()

router.use("/auth", authRouter)
router.use("/static", staticRouter)
router.use("/public", publicRouter)
router.use("/qr", qrRouter)
router.use("/upload", uploadRouter)
router.use("/analytics", analyticsRouter)
router.use("/billing", billingRouter)
router.use("/apikeys", apikeysRouter)
router.use("/webhooks", webhookRouter)
router.use("/bulk", bulkRouter)
router.use("/gdrive", gdriveRouter)
router.use("/team", teamRouter)
router.use("/report", reportRouter)
router.use("/support", supportRouter)
router.use("/careers", careersRouter)
router.use("/notifications", notificationRouter)

export default router
