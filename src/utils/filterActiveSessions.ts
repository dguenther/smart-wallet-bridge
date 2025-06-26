// If the wagmi wallet is connected via wallet connect, then we need to filter it out from the dapp sessions
export const filterActiveSessions = (sessions: any[]) => {
    // loop through sessions
    // check if session.controller matches session.self.publicKey for dapp sessions
    return sessions.filter((session) => {
      return session.controller === session.self.publicKey;
    });
};