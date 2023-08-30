import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CredentialResult } from '../models/managed-cluster-rest';


export interface AdminManagedClustersService {
  getClientAdminCredentials(subscriptionId: string, resourceGroupName: string, resourceName: string, apiVersion: string, serverFQDN: string): Observable<CredentialResult[]>;
}
