import { Injectable, Injector } from '@angular/core';
import { PlatformContext } from './platform.contract';
import { isElectronRenderer } from './desktop-bridge';
import { VaultStore } from '../services/vault/vault.store';

@Injectable({ providedIn: 'root' })
export class PlatformOrchestrationService {
  private context!: PlatformContext;

  public isElectronEnvironment(): boolean {
    return isElectronRenderer();
  }

  public async initializePlatformContext(injector: Injector): Promise<void> {
    this.context = {
      isElectron: this.isElectronEnvironment(),
      dataWire: injector.get(VaultStore)
    };
  }

  public getContext(): PlatformContext {
    if (!this.context) {
      throw new Error('PlatformOrchestrationService read before initialization context was established.');
    }
    return this.context;
  }
}
