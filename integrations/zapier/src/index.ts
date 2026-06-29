import { version as platformVersion } from "zapier-platform-core"
import authentication, { includeBearerToken } from "./authentication"
import qrScanned from "./triggers/qrScanned"
import qrCreated from "./triggers/qrCreated"
import qrUpdated from "./triggers/qrUpdated"
import qrDeleted from "./triggers/qrDeleted"
import createQR from "./creates/createQR"
import updateDestination, { qrListHidden } from "./creates/updateDestination"
import toggleQR from "./creates/toggleQR"
import deleteQR from "./creates/deleteQR"
import pkg from "../package.json"

const App = {
  version: pkg.version,
  platformVersion,
  authentication,
  beforeRequest: [includeBearerToken],
  triggers: {
    [qrScanned.key]: qrScanned,
    [qrCreated.key]: qrCreated,
    [qrUpdated.key]: qrUpdated,
    [qrDeleted.key]: qrDeleted,
    [qrListHidden.key]: qrListHidden,
  },
  creates: {
    [createQR.key]: createQR,
    [updateDestination.key]: updateDestination,
    [toggleQR.key]: toggleQR,
    [deleteQR.key]: deleteQR,
  },
}

export default App
module.exports = App
