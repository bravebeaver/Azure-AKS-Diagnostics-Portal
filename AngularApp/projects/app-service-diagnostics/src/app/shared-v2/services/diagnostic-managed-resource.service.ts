import { Observable, of } from 'rxjs';
import { StorageAccountProperties } from './shared-storage-account.service';
import { Injectable } from '@angular/core';
import { ArmResourceMetaInfo } from '../../shared/models/armObj';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticManagedResourceService {
  setStorageConfiguration(resourceToDiagnose: ArmResourceMetaInfo, storageAccountProperties: StorageAccountProperties): Observable<boolean>
  {
    return of(true);
  }
  getManagedResource(): Observable<ArmResourceMetaInfo>{
    return of(null);
  }
}
