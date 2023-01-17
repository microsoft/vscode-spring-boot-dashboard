/**
 * Reference: https://github.com/spring-projects/sts4/blob/392d953bd94543a2f132d51d217a0a0812eec896/headless-services/spring-boot-language-server/src/main/java/org/springframework/ide/vscode/boot/java/livehover/v2/SpringProcessConnectorRemote.java#L32
 */
export interface RemoteBootAppData {
    name: string;
    group?: string;
    description?: string;

    // required data for live conncetion
    host: string;
    jmxurl: string;

}

export interface RemoteBootAppDataProvider {
    provide(): Thenable<RemoteBootAppData[]> | RemoteBootAppData[];
}

export function registerRemoteBootAppDataProvider(providerName: string, provider: RemoteBootAppDataProvider);