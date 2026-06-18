import { createApp } from "./server/app";
import { PORT } from "./server/config/env";
import { registerAutomationRoutes } from "./server/routes/automation.routes";
import { registerConnectorRoutes } from "./server/routes/connector.routes";
import { registerConfigRoutes } from "./server/routes/config.routes";
import { registerEmailRoutes } from "./server/routes/email.routes";
import { registerFiscalRoutes } from "./server/routes/fiscal.routes";
import { registerLeadRoutes } from "./server/routes/lead.routes";
import { registerTicketRoutes } from "./server/routes/ticket.routes";
import { startServer } from "./server/startServer";

const app = createApp();

registerAutomationRoutes(app);
registerConfigRoutes(app);
registerConnectorRoutes(app);
registerEmailRoutes(app);
registerFiscalRoutes(app);
registerLeadRoutes(app);
registerTicketRoutes(app);

startServer(app, PORT);
