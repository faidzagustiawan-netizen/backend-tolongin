import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this.generateToken(user);
  }

  async registerTeam(createUserDto: CreateUserDto, inviteCode: string) {
    const user = await this.usersService.createTeamMember(createUserDto, inviteCode);
    return this.generateToken(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Akun Anda telah ditangguhkan (Banned). Silakan hubungi admin.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    return this.generateToken(user);
  }

  private generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      fullName: user.fullName,
      profileId: user.talentProfile?.id || user.companyProfile?.id || user.teamMemberships?.[0]?.companyId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.talentProfile || user.companyProfile || (user.teamMemberships?.length > 0 ? { ...user.teamMemberships[0].company, isTeamMember: true } : null),
      },
    };
  }
}
