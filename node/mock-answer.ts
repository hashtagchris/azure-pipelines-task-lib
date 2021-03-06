import * as path from 'path';
import * as fs from 'fs';
import * as im from'./internal';
import * as task from './task';
import { setVariable } from './mock-task';

export interface TaskLibAnswerExecResult {
    code: number,
    stdout?: string,
    stderr?: string
}

export interface TaskLibAnswers {
    checkPath?: { [key: string]: boolean },
    cwd?: { [key: string]: string },
    exec?: { [ key: string]: TaskLibAnswerExecResult },
    exist?: { [key: string]: boolean },
    find?: { [key: string]: string[] },
    findMatch?: { [key: string]: string[] },
    getPlatform?: { [key: string]: task.Platform },
    legacyFindFiles?: { [key: string]: string[] },
    ls?: { [key: string]: string },
    osType?: { [key: string]: string },
    rmRF?: { [key: string]: { success: boolean } },
    stats?: { [key: string]: any }, // Can't use `fs.Stats` as most existing uses don't mock all required properties
    variables?: {
        plaintext?: { [key: string]: string },
        secrets?: { [key: string]: string }
    },
    which?: { [key: string]: string }
}

export type MockedCommand = keyof TaskLibAnswers;

export class MockAnswers {
    private _answers: TaskLibAnswers | undefined;
    private _variableMap: { [key: string]: task.VariableInfo } | undefined;

    public initialize(answers: TaskLibAnswers) {
        if (!answers) {
            throw new Error('Answers not supplied');
        }
        this._answers = answers;

        if (this._answers.variables) {
            this._variableMap = {};

            if (this._answers.variables.plaintext) {
                for (const name in this._answers.variables.plaintext) {
                    const value = this._answers.variables.plaintext[name];

                    setVariable(name, value, false);
                }
            }

            if (this._answers.variables.secrets) {
                for (const name in this._answers.variables.secrets) {
                    const value = this._answers.variables.secrets[name];

                    setVariable(name, value, true);
                }
            }
        }
    }

    // Variables are mocked only if a variables answer is provided. This is to avoid breaking existing unit tests.
    public get variablesMocked(): boolean {
        return this._variableMap !== undefined;
    }

    public get variableMap(): { [key: string]: task.VariableInfo } | undefined {
        return this._variableMap;
    }

    public setVariable(name: string, value: string, secret: boolean) {
        if (this._variableMap === undefined) {
            throw new Error("mock-answer.setVariable shouldn't be called if variables answer wasn't provided.");
        }

        // once a secret always a secret
        const key: string = im._getVariableKey(name);
        if (this._variableMap.hasOwnProperty(key)) {
            secret = secret || this._variableMap[key].secret;
        }

        if (secret && value && value.match(/\r|\n/)) {
            if (!this._variableMap.hasOwnProperty('SYSTEM_UNSAFEALLOWMULTILINESECRET') || this._variableMap['SYSTEM_UNSAFEALLOWMULTILINESECRET'].value.toUpperCase() != 'TRUE') {
                throw new Error('loc_mock_LIB_MultilineSecret');
            }
        }

        const info: task.VariableInfo = {
            // task.setVariable uses name instead of the normalized key for the VariableInfo.
            name,
            value,
            secret
        };

        this._variableMap[key] = info;
    }

    public getResponse(cmd: MockedCommand, key: string, debug: (message: string) => void): any {
        debug(`looking up mock answers for ${JSON.stringify(cmd)}, key '${JSON.stringify(key)}'`);
        if (!this._answers) {
            throw new Error('Must initialize');
        }

        if (!this._answers[cmd]) {
            debug(`no mock responses registered for ${JSON.stringify(cmd)}`);
            return null;
        }

        const cmd_answer = this._answers[cmd]!;

        if (cmd_answer[key]) {
            debug('found mock response');
            return cmd_answer[key];
        }

        if (key && process.env['MOCK_NORMALIZE_SLASHES'] === 'true') {
            // try normalizing the slashes
            var key2 = key.replace(/\\/g, "/");
            if (cmd_answer[key2]) {
                debug('found mock response for normalized key');
                return cmd_answer[key2];
            }
        }

        debug('mock response not found');
        return null;
    }
}
