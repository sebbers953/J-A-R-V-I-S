import { readFile,writeFile,mkdir,unlink,stat,chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { homeConfig,type HomeConfig } from './home-assistant';
import { LocalInputError } from '../memory-store';
export interface Encryption {isEncryptionAvailable():boolean;encryptString(value:string):Buffer;decryptString(value:Buffer):string;getSelectedStorageBackend?():string}
export class CredentialStore {
  constructor(private path:string,private encryption:Encryption){}
  private check(){if(!this.encryption.isEncryptionAvailable()||process.platform==='linux'&&this.encryption.getSelectedStorageBackend?.()==='basic_text')throw new LocalInputError('Secure OS credential encryption is unavailable. Home Assistant remains disabled.');}
  async exists(){try{return (await stat(this.path)).isFile();}catch{return false;}}
  async save(value:unknown){this.check();const config=homeConfig(value);await mkdir(dirname(this.path),{recursive:true,mode:0o700});await writeFile(this.path,this.encryption.encryptString(JSON.stringify(config)),{mode:0o600});await chmod(this.path,0o600);}
  async load():Promise<HomeConfig>{this.check();try{if((await stat(this.path)).size>20000)throw new Error();const bytes=await readFile(this.path);if(bytes.length>20000)throw new Error();return homeConfig(JSON.parse(this.encryption.decryptString(bytes)));}catch{throw new LocalInputError('Encrypted local integration configuration could not be loaded. Reimport it locally.');}}
  async remove(){await unlink(this.path).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
