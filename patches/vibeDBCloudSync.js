"use strict";

/**
 * VibeDBCloudSync mock - no-op cloud sync
 */
Zotero.VibeDBCloudSync = new function () {
  this.init = async function () {
    console.log('[VibeDBCloudSync] Mock initialized - cloud sync disabled');
  };

  this.syncAll = async function () {};
  this.stopSync = function () {};
};
