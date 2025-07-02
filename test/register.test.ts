describe('register.ts', () => {
  test('register.ts can be imported without errors', () => {
    expect(() => require('../src/register')).not.toThrow();
  });

  test('test environment check works', () => {
    const register = require('../src/register');
    expect(register).toBeDefined();
  });

  describe('register.ts env loader tests', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    test('loads .env file with various formats', () => {
      const fs = require('fs');
      const readMock = jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue(
          'TEST_VAR=value\n' +
            'QUOTED_VAR="quoted"\n' +
            "SINGLE_QUOTED='single'\n" +
            'INVALID_LINE\n' +
            '  SPACED_VAR  =  spaced  \n' +
            'EMPTY_VAR=\n'
        );

      jest.isolateModules(() => {
        delete process.env.JEST_WORKER_ID;
        require('../src/register');
      });

      expect(readMock).toHaveBeenCalledWith('.env', 'utf-8');
      readMock.mockRestore();
    });

    test('skips .env loader when in test env', () => {
      const fs = require('fs');
      const readMock = jest.spyOn(fs, 'readFileSync');
      process.env.JEST_WORKER_ID = '1';

      jest.isolateModules(() => {
        require('../src/register');
      });

      expect(readMock).not.toHaveBeenCalled();
      readMock.mockRestore();
    });
  });
});
