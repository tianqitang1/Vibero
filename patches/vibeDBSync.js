"use strict";

/**
 * VibeDBSync mock - bypasses all auth/subscription checks
 * Always logged in, unlimited credits
 */
Zotero.VibeDBSync = new function () {
  this.PRICING = { PAGE: 1, CHAT: 4 };
  this._currentUser = { email: 'local@vibero.dev', id: 'local-user' };
  this._supabaseSession = null;

  this.init = async function () {
    console.log('[VibeDBSync] Mock initialized - auth bypassed');
  };

  this.isLoggedIn = function () {
    return true;
  };

  this.getUserBalance = async function () {
    return { credits: 999999 };
  };

  this.deductCredits = async function (_amount) {
    return true;
  };

  this.logUsage = async function (_pageCount, _inputTokens, _outputTokens, _totalTokens) {
    return true;
  };

  this.getAccessToken = async function () {
    return 'mock-token';
  };

  this.getSupabaseConfig = function () {
    return null;
  };

  this.getCurrentUser = function () {
    return this._currentUser;
  };

  this.clearUser = function () {};

  this.login = async function () {
    return { success: true };
  };

  this.register = async function () {
    return { success: true };
  };

  this.logout = async function () {};
};
