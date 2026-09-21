import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import authRouter from "./auth";
import backupRouter from "./backup";
import financialsRouter from "./financials";
import bankAccountsRouter from "./bank-accounts";
import invoicesRouter from "./invoices";
import storageRouter from "./storage";
import pmAuthRouter from "./pm-auth";
import pmProposalsRouter from "./pm-proposals";
import pmTransactionsRouter from "./pm-transactions";
import pmPayoutsRouter from "./pm-payouts";
import pmAdminRouter from "./pm-admin";
import pmSettingsRouter from "./pm-settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(jobsRouter);
router.use(backupRouter);
router.use(financialsRouter);
router.use(bankAccountsRouter);
router.use(invoicesRouter);
router.use(storageRouter);
router.use(pmAuthRouter);
router.use(pmProposalsRouter);
router.use(pmTransactionsRouter);
router.use(pmPayoutsRouter);
router.use(pmAdminRouter);
router.use(pmSettingsRouter);

export default router;
