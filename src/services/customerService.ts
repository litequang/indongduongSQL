import { Customer, CustomerImportJob } from '../types';
import { customerRepository } from '../repositories/customerRepository';
import { normalizeCustomer, normalizePhone } from '../features/customer-import/customerNormalizer';

export const customerService = {
  async importCustomers(
    customers: Customer[],
    jobInfo: Omit<CustomerImportJob, 'id' | 'createdAt'>
  ): Promise<CustomerImportJob> {
    // Generate sequential codes for the imported customers that don't have an external code
    // Wait, the normalizer currently assigns random code if missing.
    // Let's replace the code generation in normalizer with this sequential one later, 
    // or just rely on what normalizer produces for now to keep backward compatibility.
    // Actually, prompt requires sequential generation KH-000001 for both manual and import.
    const codes = await customerRepository.getNextCustomerCode(customers.length);
    customers.forEach((c, idx) => {
      // If externalId exists, maybe it was assigned as code. But let's override code if it's CUS- prefix
      if (!c.code || c.code.startsWith('CUS-') || c.code.startsWith('KH-ERR-')) {
        c.code = codes[idx];
      }
    });

    return customerRepository.importCustomers(customers, jobInfo);
  },

  async findExistingCustomersByPhones(phones: string[]): Promise<Customer[]> {
    return customerRepository.findExistingCustomersByPhones(phones);
  },
  
  async createCustomer(customerData: Omit<Customer, 'id' | 'code' | 'createdAt'>): Promise<Customer> {
    const mapped = { ...customerData, phone: customerData.phone, phoneNormalized: normalizePhone(customerData.phone) };
    if (mapped.phoneNormalized) {
      const matches = await customerRepository.findExistingCustomersByPhones([mapped.phoneNormalized]);
      if (matches.some((customer) => customer.phoneNormalized === mapped.phoneNormalized)) {
        throw new Error('Đã tồn tại khách hàng đang hoạt động với số điện thoại này.');
      }
    }
    const codes = await customerRepository.getNextCustomerCode(1);
    const code = codes[0];
    const now = new Date().toISOString();

    // Use normalization
    
    const customer: Customer = {
      ...mapped,
      id: 'cus-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      code,
      createdAt: now
    };

    await customerRepository.createCustomer(customer);
    return customer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    if (updates.phone) {
      updates.phoneNormalized = normalizePhone(updates.phone);
    }
    updates.updatedAt = new Date().toISOString();
    await customerRepository.updateCustomer(id, updates);
  },

  async softDeleteCustomer(id: string): Promise<void> {
    await customerRepository.updateCustomer(id, { deletedAt: new Date().toISOString() });
  },

  async getCustomers(): Promise<Customer[]> {
    return customerRepository.getCustomers();
  },

  subscribeCustomers(onData: (customers: Customer[]) => void, onError: (error: Error) => void): () => void {
    return customerRepository.subscribeCustomers(onData, onError);
  }
};
