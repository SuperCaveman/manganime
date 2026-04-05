import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_USER_POOL_ID,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

export function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        localStorage.setItem('idToken', session.getIdToken().getJwtToken());
        resolve(session);
      },
      onFailure: reject,
    });
  });
}

export function signUp(email, password, locale = 'en', username = '') {
  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: 'custom:preferred_locale', Value: locale }),
    ];
    if (username.trim()) {
      attrs.push(new CognitoUserAttribute({ Name: 'nickname', Value: username.trim() }));
    }
    userPool.signUp(email, password, attrs, null, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

export function confirmSignUp(email, code) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

export function signOut() {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
  localStorage.removeItem('idToken');
}

export function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve(null);
    cognitoUser.getSession((err, session) => {
      if (err) return reject(err);
      if (!session.isValid()) return resolve(null);

      const token = session.getIdToken().getJwtToken();
      localStorage.setItem('idToken', token);

      let userId;
      try { userId = JSON.parse(atob(token.split('.')[1])).sub; } catch {}

      cognitoUser.getUserAttributes((attrErr, attrs) => {
        const attrMap = {};
        (attrs || []).forEach((a) => { attrMap[a.getName()] = a.getValue(); });
        const email = cognitoUser.getUsername();
        resolve({
          cognitoUser,
          email,
          username: attrMap.nickname || email.split('@')[0],
          userId,
        });
      });
    });
  });
}

export function updateUsername(username) {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return reject(new Error('Not signed in'));
    cognitoUser.getSession((err) => {
      if (err) return reject(err);
      const attr = new CognitoUserAttribute({ Name: 'nickname', Value: username.trim() });
      cognitoUser.updateAttributes([attr], (updateErr, result) => {
        if (updateErr) return reject(updateErr);
        resolve(result);
      });
    });
  });
}
