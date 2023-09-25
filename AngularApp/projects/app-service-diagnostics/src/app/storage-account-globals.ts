import { Injectable } from "@angular/core";
import { Subject } from 'rxjs';
import { StorageAccountProperties } from "./shared-v2/services/shared-storage-account.service";

@Injectable({ providedIn: 'root' })
export class StorageAccountGlobals {
  // control the panel for creating a new storage account
  openCreateStorageAccountPanel: boolean;

  // Observable string sources
  private emitChangeSource = new Subject<StorageAccountProperties>();

  // Observable string streams
  changeEmitted$ = this.emitChangeSource.asObservable();

  // Service message commands
  emitChange(change: StorageAccountProperties) {
    this.emitChangeSource.next(change);
    this.openCreateStorageAccountPanel = false;
  }
}
