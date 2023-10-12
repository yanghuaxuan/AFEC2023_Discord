import proc from "node:process"

export interface MembersSchema {
    _id: string;
    firstName: string;
    lastName: string;
    avatar: string;
}

export interface TeamSchema {
    _id: string;
    owner: string;
    program_id: string;
    name: string;
    password: string;
    members: MembersSchema[]
    adks: Array<unknown>
}

export interface ResponseJsonSchema {
    message: string;
    data: TeamSchema[];
}

// Fetch teams data from Pilotcity
export async function fetchTeams(): Promise<TeamSchema[]> {
    const PROGRAM_ID = proc.env.PC_PROGRAM_ID;
    const TOKEN = proc.env.PC_OAUTH_TOKEN;

    if (!PROGRAM_ID && !TOKEN) {
        return [];
    }

    const url = proc.env.PC_PROGRAM_SERVICE_URL + `/programs/teams?program_id=${PROGRAM_ID}`
    const tokenHeader = new Headers({"Authorization": TOKEN as string})
    const resp = await fetch(url, {headers: tokenHeader})

    if (resp.status !== 200) {
        return []
    }

    const teams = (await resp.json() as ResponseJsonSchema).data

    return teams
}