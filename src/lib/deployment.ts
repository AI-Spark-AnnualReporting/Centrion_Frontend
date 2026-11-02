// Which kind of install this frontend was built for. Set VITE_DEPLOYMENT=on_prem
// when building for a client's own server (it mirrors the backend's DEPLOYMENT).
// On-premises installs may have no email server, so a few screens offer the
// Spark-code alternatives (e.g. resetting a password with a code from Spark).
export const IS_ON_PREM = import.meta.env.VITE_DEPLOYMENT === "on_prem";
