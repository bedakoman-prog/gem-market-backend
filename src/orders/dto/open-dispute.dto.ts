import { IsString, MinLength } from 'class-validator';

export class OpenDisputeDto {
    @IsString()
    @MinLength(5, { message: 'Merci de préciser le motif du litige (5 caractères minimum).' })
    reason!: string;
}
